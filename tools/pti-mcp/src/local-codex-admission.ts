import {assertAdmissionOpen,type Maintenance} from './local-codex-maintenance.js';
export type Reservation = {
  id:string;generation:number;project:string;mode:'inspect'|'edit';resourcePath:string|null;threadId?:string;affinityId?:string;
  status:'queued'|'running'|'waiting_for_user'|'unresolved_native_writer';until:number;
  kind?:'model'|'desktop'|'history'|'host-control';nativeTurnId?:string;
  // Desktop-owned turns can outlive the hosted worker lease. Their checkout
  // fence survives lease expiry until exact terminal or non-delivery evidence.
  nativeWriterFence?:boolean;
};
export type AdmissionBlocker = {
  reason:'module'|'thread'|'checkout'|'capacity'|'host-control';taskId:string;generation:number;
  status:Reservation['status'];resourcePath:string|null;
};
export type SchedulerPatch = {reservations:Reservation[];activeTask?:string|null};
type Host = {version:string;maxConcurrentTasks?:number|null;activeTask?:string|null;at:number;reservations?:Reservation[];maintenance?:Maintenance|null};
export function concurrentWorker(host:Pick<Host,'version'>) {
  const [major,minor]=host.version.split('.').map(Number);
  return major>0||minor>=4;
}
export function uncappedWorker(host:Pick<Host,'version'>) {
  const [major,minor,patch=0]=host.version.split('.').map(Number);
  return major>0||minor>4||minor===4&&patch>=2;
}
// null means no bridge ceiling. Preserve older workers' actual capabilities
// until upgraded; do not reinterpret their omitted fields as unbounded support.
export function capacity(host:Host):number|null {
  if(!concurrentWorker(host))return 1;
  return host.maxConcurrentTasks??(uncappedWorker(host)?null:3);
}
export function resourcePath(value:string) {return value.replaceAll('\\','/').replace(/\/+$/,'').toLowerCase();}
export function pathsOverlap(a:string,b:string) {const left=resourcePath(a),right=resourcePath(b);return left===right||left.startsWith(right+'/')||right.startsWith(left+'/');}
const liveReservation=(slot:Reservation,now:number)=>slot.until>=now||slot.nativeWriterFence===true;
export function reservations(host:Host,now:number) {
  const result=(host.reservations||[]).filter(slot=>liveReservation(slot,now));
  // Existing pre-0.4 claims have no server reservation. Keep their legacy fence
  // until the worker releases the claim or the last heartbeat expires.
  if(!concurrentWorker(host)&&host.activeTask&&!result.some(slot=>slot.id===host.activeTask)&&host.at+60000>now) {
    result.push({id:host.activeTask,generation:0,project:'legacy',mode:'edit',resourcePath:null,status:'running',until:host.at+60000});
  }
  return result;
}
function describeBlocker(reason:AdmissionBlocker['reason'],slot:Reservation):AdmissionBlocker {
  return {reason,taskId:slot.id,generation:slot.generation,status:slot.status,resourcePath:slot.resourcePath};
}
const hostControl=(slot:Reservation)=>slot.kind==='host-control';
const running=(slot:Reservation)=>slot.status!=='queued';
function conflicts(next:Reservation,slot:Reservation):AdmissionBlocker|null {
  if(hostControl(next)||hostControl(slot))return hostControl(next)&&hostControl(slot)?describeBlocker('host-control',slot):null;
  if(next.affinityId&&next.affinityId===slot.affinityId)return describeBlocker('module',slot);
  if(next.threadId&&next.threadId===slot.threadId)return describeBlocker('thread',slot);
  if(next.resourcePath&&slot.resourcePath&&(next.mode==='edit'||slot.mode==='edit')&&pathsOverlap(next.resourcePath,slot.resourcePath))return describeBlocker('checkout',slot);
  return null;
}
export function admissionBlocker(host:Host,next:Reservation,now:number):AdmissionBlocker|null {
  const current=reservations(host,now).filter(slot=>!(slot.id===next.id&&slot.generation===next.generation));
  for(const slot of current){const blocker=conflicts(next,slot);if(blocker)return blocker;}
  return null;
}
// Enqueue is an owner-scoped Firestore root transaction; pending entries retain
// their insertion order and never consume execution capacity or a worker lease.
// A second module parent remains a hard rejection because native affinity is
// assigned at submission, not at claim time.
export function queueReservation(host:Host,next:Reservation,now:number):SchedulerPatch {
  assertAdmissionOpen(host);
  const current=reservations(host,now).filter(slot=>!(slot.id===next.id&&slot.generation===next.generation));
  const blocker=next.affinityId?current.find(slot=>slot.affinityId===next.affinityId):undefined;
  if(blocker)throw Error(`Local Codex module is active in task ${blocker.id}. Continue that outcome with native subagents for independent lanes, or wait before starting a related outcome. Nothing was queued.`);
  return {reservations:[...current,{...next,status:'queued',until:Number.MAX_SAFE_INTEGER}]};
}
export function queuePosition(host:Host,next:Pick<Reservation,'id'|'generation'>,now:number):number|null {
  const current=reservations(host,now).filter(slot=>slot.status==='queued');
  const index=current.findIndex(slot=>slot.id===next.id&&slot.generation===next.generation);
  return index<0?null:index+1;
}
export function claimBlocker(host:Host,next:Reservation,now:number):AdmissionBlocker|null {
  const current=reservations(host,now),index=current.findIndex(slot=>slot.id===next.id&&slot.generation===next.generation);
  if(index<0)return null; // Legacy jobs were queued before persisted reservations.
  const other=current.filter((slot,position)=>position!==index&&(running(slot)||position<index));
  for(const slot of other){const blocker=conflicts(next,slot);if(blocker)return blocker;}
  if(hostControl(next))return null;
  const active=current.filter(slot=>running(slot)&&!hostControl(slot)&&!(slot.id===next.id&&slot.generation===next.generation));
  const limit=capacity(host);
  if(limit!==null&&active.length>=limit)return describeBlocker('capacity',active[0]);
  // A later independent job may pass an older *blocked* job, but may not
  // overtake an older runnable job merely because workers claimed concurrently.
  for(const previous of current.slice(0,index)){
    if(previous.status!=='queued'||hostControl(previous))continue;
    if(!active.some(slot=>conflicts(previous,slot)))return describeBlocker('capacity',previous);
  }
  return null;
}
export function admission(host:Host,next:Reservation,now:number):SchedulerPatch {
  assertAdmissionOpen(host);
  const current=reservations(host,now).filter(slot=>!(slot.id===next.id&&slot.generation===next.generation));
  const blocker=admissionBlocker(host,next,now);
  if(blocker?.reason==='module')throw Error(`Local Codex module is active in task ${blocker.taskId}. Continue that outcome with native subagents for independent lanes, or wait before starting a related outcome. Nothing was queued.`);
  if(blocker)throw Error(`Local Codex work conflicts with task ${blocker.taskId}. Wait for that task to finish. Nothing was queued.`);
  const limit=capacity(host);
  if(!hostControl(next)&&limit!==null&&current.filter(slot=>!hostControl(slot)).length>=limit)throw Error(concurrentWorker(host)
    ?`Local Codex capacity is full (${current.map(slot=>slot.id).join(', ')}). Nothing was queued.`
    :`Local Codex is busy with task ${current[0].id}. Wait for that task to finish. Nothing was queued.`);
  return {reservations:[...current,next]};
}
export function changedReservation(host:Host|undefined,job:{id:string;generation:number;status:string;leaseUntil?:number;expiresAt:number|null;threadId?:string;affinityId?:string;nativeTurnId?:string;nativeWriterFence?:boolean;nativeTerminalObserved?:boolean;nativeDeliveryAbsent?:boolean},now:number):SchedulerPatch {
  const current=(host?.reservations||[]).filter(slot=>liveReservation(slot,now));
  const done=['completed','failed','interrupted'].includes(job.status);
  const next=current.flatMap(slot=>{
    if(slot.id!==job.id||slot.generation!==job.generation)return [slot];
    if(done){
      if(!(slot.nativeWriterFence||job.nativeWriterFence)||job.nativeTerminalObserved===true||job.nativeDeliveryAbsent===true)return [];
      return [{...slot,status:'unresolved_native_writer' as const,nativeWriterFence:true,...(job.nativeTurnId?{nativeTurnId:job.nativeTurnId}:{})}];
    }
    return [{...slot,status:job.status as Reservation['status'],until:job.status==='queued'?Number.MAX_SAFE_INTEGER:job.leaseUntil!,...(job.threadId?{threadId:job.threadId}:{}),...(job.nativeTurnId?{nativeTurnId:job.nativeTurnId}:{}),...(job.nativeWriterFence?{nativeWriterFence:true}:{})}];
  });
  const stillFenced=next.some(slot=>slot.id===job.id&&slot.generation===job.generation);
  return {reservations:next,...(done&&!stillFenced&&host?.activeTask===job.id?{activeTask:null}:{})};
}
