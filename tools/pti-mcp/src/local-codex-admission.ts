export type Reservation = {
  id:string;generation:number;project:string;mode:'inspect'|'edit';resourcePath:string|null;threadId?:string;
  status:'queued'|'running'|'waiting_for_user';until:number;
};
export type SchedulerPatch = {reservations:Reservation[];activeTask?:string|null};
type Host = {version:string;maxConcurrentTasks?:number;activeTask?:string|null;at:number;reservations?:Reservation[]};
export function concurrentWorker(host:Pick<Host,'version'>) {
  const [major,minor]=host.version.split('.').map(Number);
  return major>0||minor>=4;
}
export function capacity(host:Host) { return concurrentWorker(host)?Math.min(4,Math.max(1,host.maxConcurrentTasks||3)):1; }
export function resourcePath(value:string) {return value.replaceAll('\\','/').replace(/\/+$/,'').toLowerCase();}
export function pathsOverlap(a:string,b:string) {const left=resourcePath(a),right=resourcePath(b);return left===right||left.startsWith(right+'/')||right.startsWith(left+'/');}
export function reservations(host:Host,now:number) {
  const result=(host.reservations||[]).filter(slot=>slot.until>=now);
  // Existing pre-0.4 claims have no server reservation. Keep their legacy fence
  // until the worker releases the claim or the last heartbeat expires.
  if(!concurrentWorker(host)&&host.activeTask&&!result.some(slot=>slot.id===host.activeTask)&&host.at+60000>now) {
    result.push({id:host.activeTask,generation:0,project:'legacy',mode:'edit',resourcePath:null,status:'running',until:host.at+60000});
  }
  return result;
}
export function admission(host:Host,next:Reservation,now:number):SchedulerPatch {
  const current=reservations(host,now).filter(slot=>!(slot.id===next.id&&slot.generation===next.generation));
  const threadConflict=next.threadId?current.find(slot=>slot.threadId===next.threadId):undefined;
  const pathConflict=next.resourcePath?current.find(slot=>slot.resourcePath&&(next.mode==='edit'||slot.mode==='edit')&&pathsOverlap(next.resourcePath!,slot.resourcePath)):undefined;
  if(threadConflict||pathConflict)throw Error(`Local Codex work conflicts with task ${(threadConflict||pathConflict)!.id}. Wait for that task to finish. Nothing was queued.`);
  if(current.length>=capacity(host))throw Error(concurrentWorker(host)
    ?`Local Codex capacity is full (${current.map(slot=>slot.id).join(', ')}). Nothing was queued.`
    :`Local Codex is busy with task ${current[0].id}. Wait for that task to finish. Nothing was queued.`);
  return {reservations:[...current,next]};
}
export function changedReservation(host:Host|undefined,job:{id:string;generation:number;status:string;leaseUntil?:number;expiresAt:number;threadId?:string},now:number):SchedulerPatch {
  const current=(host?.reservations||[]).filter(slot=>slot.until>=now);
  const done=['completed','failed','interrupted'].includes(job.status);
  const next=current.flatMap(slot=>{
    if(slot.id!==job.id||slot.generation!==job.generation)return [slot];
    if(done)return [];
    return [{...slot,status:job.status as Reservation['status'],until:job.status==='queued'?job.expiresAt:job.leaseUntil!,...(job.threadId?{threadId:job.threadId}:{})}];
  });
  return {reservations:next,...(done&&host?.activeTask===job.id?{activeTask:null}:{})};
}
