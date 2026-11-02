// Local process supervision is independent of the authenticated Start mailbox.
// Its unchanged server-side 90s TTL requires a heartbeat even with a live worker.
export const HEALTHY_POLL_MS=60000,REPAIR_POLL_MS=15000,LOCAL_CHECK_MS=2000;
const safeCode=error=>['authentication_required','configuration_invalid','model_unavailable','port_in_use','worker_start_timeout'].includes(error?.message)?error.message:'gateway_unavailable';
export class GtopSupervisor {
  constructor({host,poll,read,write,now=()=>Date.now()}) {
    Object.assign(this,{host,poll,read,write,now});
    this.nextPoll=0;this.nextRecovery=0;this.failures=0;this.recoveryFailures=0;
    this.counters={localChecks:0,mailboxTicks:0,mailboxFailures:0,recoveryAttempts:0,recoveries:0};
  }
  tick(){
    if(!this.pending)this.pending=this.tickOnce().finally(()=>{this.pending=undefined;});
    return this.pending;
  }
  async adopt(){
    if(this.intent.managed)return;
    const intent={managed:true,adoptedAt:new Date(this.now()).toISOString()};
    await this.write(intent);this.intent=intent;
  }
  async tickOnce(){
    this.intent??=await this.read()||{};
    let observation;
    try{observation=await this.host.observe();}catch{observation={state:'unknown'};}
    this.counters.localChecks++;
    if(observation.state==='running')await this.adopt(); // Durable before recovery.
    if(observation.state==='running'&&observation.healthy!==false){this.recoveryFailures=0;this.recoveryErrorCode=null;}
    const changed=this.previousState!==undefined&&this.previousState!==observation.state;
    this.previousState=observation.state;
    // A real stop bypasses the healthy interval, never authentication/network backoff.
    if(changed&&!this.failures)this.nextPoll=Math.min(this.nextPoll,this.now());
    if(this.now()>=this.nextPoll){
      this.counters.mailboxTicks++;
      try{
        this.service=await this.poll();this.lastPollAt=new Date(this.now()).toISOString();
        this.failures=0;this.errorCode=null;
        // poll() can consume an authorized Start; inspect again before recovery.
        observation=await this.host.observe(true);
        if(observation.state==='running')await this.adopt();
        // Only confirmed absence and a successful authenticated poll authorize repair.
        // Never kill/restart an alive, unhealthy, unknown or conflicting process.
        if(observation.state==='stopped'&&this.intent.managed&&this.now()>=this.nextRecovery){
          this.counters.recoveryAttempts++;
          this.nextRecovery=this.now()+REPAIR_POLL_MS;
          try{
            await this.host.start();observation=await this.host.observe(true);
            if(observation.state!=='running')throw Error('worker_start_timeout');
            this.counters.recoveries++;this.recoveryFailures=0;this.recoveryErrorCode=null;
          }catch(error){
            this.recoveryErrorCode=safeCode(error);
            this.nextRecovery=this.now()+Math.min(300000,REPAIR_POLL_MS*2**Math.min(this.recoveryFailures++,5));
          }
        }
        this.nextPoll=this.now()+(observation.state==='running'&&observation.healthy!==false?HEALTHY_POLL_MS:REPAIR_POLL_MS);
      }catch(error){
        this.counters.mailboxFailures++;this.errorCode=safeCode(error);
        this.nextPoll=this.now()+Math.min(60000,REPAIR_POLL_MS*2**Math.min(this.failures++,2));
      }
    }
    this.previousState=observation.state;
    const state=this.errorCode?'unavailable':observation.state==='unknown'?'unavailable':observation.state==='stopped'?'offline':observation.healthy===false?'offline':this.service?.state||'starting';
    return {checkedAt:new Date(this.now()).toISOString(),lastPollAt:this.lastPollAt||null,state,localState:observation.state,workerRunning:observation.state==='running',workerHealthy:observation.healthy??null,errorCode:this.errorCode||this.recoveryErrorCode||null,nextPollAt:new Date(this.nextPoll).toISOString(),managed:this.intent.managed===true,counters:{...this.counters}};
  }
}
