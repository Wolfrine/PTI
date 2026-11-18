import type {Firestore} from 'firebase-admin/firestore';

export type Maintenance={id:string;phase:'draining'|'installing'|'recovery-required';targetVersion:string;artifactSetHash:string;startedAt:number;deadline:number;instanceId:string;protectedTasks:{id:string;generation:number}[];protectedFinalStates?:{id:string;generation:number;status:string}[]};
export function admissionBlocked(host:{maintenance?:Maintenance|null}|undefined){return !!host?.maintenance;}
export function assertAdmissionOpen(host:{maintenance?:Maintenance|null}){
  if(admissionBlocked(host))throw Error(`Local Codex maintenance ${host.maintenance!.id} is ${host.maintenance!.phase}. New work is rejected, not queued. Read bridge_status; existing jobs continue. Nothing was queued.`);
}
export type MaintenanceRequest={id:string;targetVersion:string;artifactSetHash:string;deadline:number};
const live=['queued','running','waiting_for_user'];
type NativeWriterFence={id:string;generation:number|null;status:string;threadId:string|null;nativeTurnId:string|null};
// Read the RAW owner document. The admission helper's time-filtered capacity
// view is not sufficient for maintenance: a terminal bridge job can still
// own a desktop/native writer, even after its hosted lease expires.
function unresolvedNativeWriters(host:{reservations?:unknown}|undefined):NativeWriterFence[]{
  const raw=host?.reservations;
  if(raw==null)return [];
  if(!Array.isArray(raw))throw Error('Owner native-writer reservations are malformed; maintenance cannot seal/release.');
  return raw.flatMap(slot=>{
    if(!slot||typeof slot!=='object')throw Error('Owner reservation entry is malformed; maintenance cannot seal/release.');
    const item=slot as Record<string,unknown>;
    if(item.nativeWriterFence!==true&&item.status!=='unresolved_native_writer')return [];
    return [{id:typeof item.id==='string'?item.id:'unknown',generation:Number.isInteger(item.generation)?item.generation as number:null,
      status:typeof item.status==='string'?item.status:'unknown',threadId:typeof item.threadId==='string'?item.threadId:null,
      nativeTurnId:typeof item.nativeTurnId==='string'?item.nativeTurnId:null}];
  });
}
function requireNativeWritersResolved(host:{reservations?:unknown}|undefined){
  const fences=unresolvedNativeWriters(host);
  if(fences.length)throw Error('Unresolved native writer reservation(s): '+fences.map(item=>item.id+'/'+(item.generation??'?')).join(', ')+'. Exact native terminal or confirmed non-delivery evidence must release each fence; hosted terminal status/lease expiry is insufficient.');
}

// Admission, claims and this controller serialize on the SAME owner document.
// A deadline never opens admission during an interrupted pointer swap.
export class FirestoreMaintenance {
  constructor(private db:Firestore,private owner:string,private clock=()=>Date.now()){}
  private root(uid:string){if(uid!==this.owner)throw Error('Account is not authorized.');return this.db.doc(`_ptiLocalServices/local-codex/owners/${uid}`);}
  private query(uid:string){return this.root(uid).collection('jobs').where('status','in',live);}
  private matching(value:Maintenance|null|undefined,request:MaintenanceRequest){
    if(!value||value.id!==request.id||value.artifactSetHash!==request.artifactSetHash||value.targetVersion!==request.targetVersion)throw Error('Maintenance ownership or staged artifact hash changed.');
    return value;
  }
  private async terminalEvidence(tx:any,uid:string,maintenance:Maintenance){
    if(!maintenance.protectedTasks.length)return [];
    const refs=maintenance.protectedTasks.map(t=>this.root(uid).collection('jobs').doc(t.id)),snapshots=await tx.getAll(...refs);
    return snapshots.map((snapshot:any,index:number)=>{const job=snapshot.data(),expected=maintenance.protectedTasks[index];if(!job||job.generation!==expected.generation||!['completed','failed','interrupted'].includes(job.status))throw Error('Protected task is missing, changed generation, or has not finished; no installation/release.');return {...expected,status:job.status};});
  }
  async status(uid:string){const [root,jobs]=await Promise.all([this.root(uid).get(),this.query(uid).get()]);const h=root.data();return {maintenance:h?.maintenance||null,lastMaintenance:h?.lastMaintenance||null,worker:{version:h?.version,at:h?.at,dispatchReady:h?.dispatchReady,instanceId:h?.instanceId,maintenanceProtocol:h?.maintenanceProtocol,maintenanceProtocolAt:h?.maintenanceProtocolAt},nonterminal:jobs.docs.map(d=>({id:d.id,generation:d.data().generation,status:d.data().status})),unresolvedNativeWriters:unresolvedNativeWriters(h)};}
  async begin(uid:string,request:MaintenanceRequest){
    if(!/^[a-f0-9-]{36}$/.test(request.id)||!/^\d+\.\d+\.\d+$/.test(request.targetVersion)||!/^[a-f0-9]{64}$/.test(request.artifactSetHash)||request.deadline<=this.clock())throw Error('Invalid maintenance identity, version, hashes or deadline.');
    return this.db.runTransaction(async tx=>{
      const root=this.root(uid),[snapshot,jobs]=await Promise.all([tx.get(root),tx.get(this.query(uid))]),host=snapshot.data();
      if(host?.maintenance)return this.matching(host.maintenance,request);
      if(host?.maintenanceProtocol!==1||host?.maintenanceProtocolAt!==host?.at)throw Error('Deploy and observe the maintenance-aware hosted service before beginning drain.');
      if(!host||host.authMode!=='chatgpt'||host.dispatchReady!==true||this.clock()-host.at>60000)throw Error('A fresh connected owner worker is required before draining.');
      if(jobs.docs.some(d=>d.data().status==='queued'))throw Error('Previously accepted queued work must be claimed/finished before drain. Nothing was canceled or dropped.');
      const maintenance:Maintenance={...request,phase:'draining',startedAt:this.clock(),instanceId:host.instanceId,protectedTasks:jobs.docs.map(d=>({id:d.id,generation:d.data().generation}))};
      tx.set(root,{maintenance},{merge:true});return maintenance;
    });
  }
  async reconcileExpired(uid:string,request:MaintenanceRequest){
    return this.db.runTransaction(async tx=>{
      const root=this.root(uid),[snapshot,jobs]=await Promise.all([tx.get(root),tx.get(this.query(uid))]);
      const maintenance=this.matching(snapshot.data()?.maintenance,request),at=this.clock();
      if(maintenance.phase!=='draining'||at>=maintenance.deadline)throw Error('Expired leases may be reconciled only under the matching unsealed drain.');
      const expired=jobs.docs.filter(doc=>{const job=doc.data();return job.status!=='queued'&&typeof job.leaseUntil==='number'&&Number.isFinite(job.leaseUntil)&&job.leaseUntil<at&&maintenance.protectedTasks.some(task=>task.id===doc.id&&task.generation===job.generation);});
      for(const doc of expired){
        const job=doc.data();
        // Public get_task already reports a lost lease as interrupted. Persist
        // that bridge fact; it is neither native completion nor a native stop.
        tx.update(doc.ref,{status:'interrupted',updatedAt:at,
          snapshot:{...(job.snapshot||{}),status:'interrupted',error:'The bridge lease expired. Native execution/outcome is unknown; no native stop or resubmission was performed.'},
          leaseReconciliation:{maintenanceId:request.id,generation:job.generation,at,previousStatus:job.status,previousLeaseUntil:job.leaseUntil,previousError:job.snapshot?.error??null,nativeStopRequested:false}});
      }
      return {at,reconciled:expired.map(doc=>({id:doc.id,generation:doc.data().generation,previousLeaseUntil:doc.data().leaseUntil,status:'interrupted'})),nativeStopRequested:false};
    });
  }
  async seal(uid:string,request:MaintenanceRequest){
    return this.db.runTransaction(async tx=>{
      const root=this.root(uid),[snapshot,jobs]=await Promise.all([tx.get(root),tx.get(this.query(uid))]),host=snapshot.data(),maintenance=this.matching(host?.maintenance,request);
      if(maintenance.phase!=='draining'||this.clock()>=maintenance.deadline)throw Error('Drain expired or was already sealed.');
      if(jobs.docs.length)throw Error('busy: existing jobs have not reached terminal state.');
      requireNativeWritersResolved(host);
      if(host?.instanceId!==maintenance.instanceId||host?.dispatchReady!==true||this.clock()-host.at>60000)throw Error('Worker changed or stopped while draining.');
      const protectedFinalStates=await this.terminalEvidence(tx,uid,maintenance);
      const next={...maintenance,phase:'installing' as const,protectedFinalStates};tx.set(root,{maintenance:next},{merge:true});return next;
    });
  }
  async guard(uid:string,request:MaintenanceRequest){const state=await this.status(uid);const maintenance=this.matching(state.maintenance,request);if(!['installing','recovery-required'].includes(maintenance.phase)||state.nonterminal.length||state.unresolvedNativeWriters.length)throw Error('Sealed idle maintenance with no unresolved native writers is required.');return state;}
  async abort(uid:string,request:MaintenanceRequest){
    return this.db.runTransaction(async tx=>{const root=this.root(uid),snapshot=await tx.get(root),maintenance=this.matching(snapshot.data()?.maintenance,request);if(maintenance.phase!=='draining')throw Error('Sealed/interrupted install requires recovery, not unguarded admission release.');const result={id:request.id,outcome:'aborted-before-install',at:this.clock()};tx.set(root,{maintenance:null,lastMaintenance:result},{merge:true});return result;});
  }
  async recovery(uid:string,request:MaintenanceRequest){
    return this.db.runTransaction(async tx=>{const root=this.root(uid),snapshot=await tx.get(root),maintenance=this.matching(snapshot.data()?.maintenance,request);tx.set(root,{maintenance:{...maintenance,phase:'recovery-required'}},{merge:true});return {recoveryRequired:true,id:request.id};});
  }
  async finish(uid:string,request:MaintenanceRequest,version:string,notBefore:number,receipt:string){
    return this.db.runTransaction(async tx=>{
      const root=this.root(uid),[snapshot,jobs]=await Promise.all([tx.get(root),tx.get(this.query(uid))]),host=snapshot.data(),maintenance=this.matching(host?.maintenance,request);
      if(jobs.docs.length||host?.version!==version||host?.dispatchReady!==true||host.at<notBefore||this.clock()-host.at>60000)throw Error('Fresh hosted heartbeat/version and no nonterminal jobs are required to release maintenance.');
      requireNativeWritersResolved(host);
      const protectedFinalStates=await this.terminalEvidence(tx,uid,maintenance);
      const result={id:request.id,outcome:version===request.targetVersion?'activated-verified':'rolled-back-verified',version,at:this.clock(),heartbeatAt:host.at,receipt,protectedFinalStates};
      tx.set(root,{maintenance:null,lastMaintenance:result},{merge:true});return result;
    });
  }
}
