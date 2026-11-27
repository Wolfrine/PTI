import {ResourceSampler,RESOURCE_SAMPLE_MS,emptyResources} from './resources.mjs';

export const PROGRESS_PUBLISH_MS=25000;
export const PROGRESS_STAGES=Object.freeze(['preparing','loading-model','encoding-references','encoding-prompt','loading-diffusion','sampling','decoding','publishing']);

// One active attempt owns this short-lived sampler and serialized, coalescing writer.
// stop() freezes new events and drains every write before any terminal job write.
export class LiveProgress {
 constructor({publish,jobStartedAt,now=Date.now,sampler=new ResourceSampler({now}),sampleMs=RESOURCE_SAMPLE_MS,publishMs=PROGRESS_PUBLISH_MS,timers=globalThis}={}){
  this.publish=publish;this.now=now;this.sampler=sampler;this.sampleMs=sampleMs;this.publishMs=publishMs;this.timers=timers;
  const at=now();this.value={stage:'preparing',jobStartedAt:Number.isSafeInteger(jobStartedAt)?jobStartedAt:at,stageStartedAt:at,updatedAt:at,stageDurations:{},step:null,total:null,resources:emptyResources(at)};
  this.started=false;this.closed=false;this.pending=null;this.writer=null;this.sampling=null;this.stopping=null;this.abort=new AbortController();
 }
 snapshot(){return structuredClone({...this.value,updatedAt:this.now()});}
 async start(){
  if(this.started||this.closed)return;this.started=true;
  this.sampleTimer=this.timers.setInterval(()=>{void this.sample();},this.sampleMs);
  this.publishTimer=this.timers.setInterval(()=>{this.enqueue();},this.publishMs);
  await this.sample();if(!this.closed)void this.enqueue();
 }
 sample(){
  if(this.closed||this.sampling)return this.sampling??Promise.resolve();
  this.sampling=Promise.resolve().then(()=>this.sampler.sample({signal:this.abort.signal})).then(resources=>{if(!this.closed)this.value.resources=resources;}).catch(()=>{
   if(!this.closed)this.value.resources=emptyResources(this.now());
  }).finally(()=>{this.sampling=null;});
  return this.sampling;
 }
 stage(stage){
  if(this.closed||!PROGRESS_STAGES.includes(stage)||stage===this.value.stage)return;
  const at=this.now(),previous=this.value.stage;
  this.value.stageDurations[previous]=(this.value.stageDurations[previous]??0)+Math.max(0,at-this.value.stageStartedAt);
  Object.assign(this.value,{stage,stageStartedAt:at,step:null,total:null});
  return this.enqueue();
 }
 counter({step,total}={}){
  // ComfyUI uses the same callback for VAE tiles: only sampler-stage counts qualify.
  if(this.closed||this.value.stage!=='sampling'||!Number.isSafeInteger(step)||!Number.isSafeInteger(total)||total<1||total>10000||step<0||step>total)return;
  if(this.value.total!==null&&(total!==this.value.total||step<this.value.step))return;
  this.value.step=step;this.value.total=total;
 }
 enqueue(){
  if(this.closed)return this.writer??Promise.resolve();
  this.pending=this.snapshot();return this.drain();
 }
 drain(){
  if(!this.writer)this.writer=(async()=>{
   while(this.pending){
    const value=this.pending;this.pending=null;
    // Telemetry is failure tolerant; the next periodic/stage snapshot retries current state.
    try{if(await this.publish(value)===false){this.lostClaim=true;this.close();this.pending=null;}}catch{}
   }
  })().finally(()=>{this.writer=null;});
  return this.writer;
 }
 close(){
  this.closed=true;this.timers.clearInterval(this.sampleTimer);this.timers.clearInterval(this.publishTimer);this.abort.abort();
 }
 stop(){
  if(this.stopping)return this.stopping;
  this.close();
  this.stopping=(async()=>{
   await this.sampling;
   if(this.started&&!this.lostClaim){
    const stage=this.value.stage;
    this.value.stageDurations[stage]=(this.value.stageDurations[stage]??0)+Math.max(0,this.now()-this.value.stageStartedAt);
    this.pending=this.snapshot();
    do{await this.drain();}while(this.pending||this.writer);
   }else await this.writer;
  })();
  return this.stopping;
 }
}
