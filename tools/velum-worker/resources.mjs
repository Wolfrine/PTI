import os from 'node:os';
import {execFile} from 'node:child_process';

export const RESOURCE_SAMPLE_MS=5000;
export const GPU_TIMEOUT_MS=2000;
export const emptyResources=sampledAt=>({sampledAt,cpuPercent:null,ramUsedBytes:null,ramTotalBytes:null,gpuUtilPercent:null,vramUsedMiB:null,vramTotalMiB:null,gpuTempC:null});
const bounded=(value,max)=>Number.isFinite(value)&&value>=0&&value<=max?value:null;
const cpuTimes=cpus=>cpus.reduce((sum,cpu)=>{
 const times=Object.values(cpu.times);
 return {idle:sum.idle+cpu.times.idle,total:sum.total+times.reduce((a,b)=>a+b,0)};
},{idle:0,total:0});

export function readGpu({execute=execFile,signal,timeoutMs=GPU_TIMEOUT_MS}={}){
 return new Promise(resolve=>{
  const unavailable={gpuUtilPercent:null,vramUsedMiB:null,vramTotalMiB:null,gpuTempC:null};
  try{execute('nvidia-smi',['--id=0','--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu','--format=csv,noheader,nounits'],
   {windowsHide:true,shell:false,encoding:'utf8',timeout:timeoutMs,maxBuffer:4096,signal},(error,stdout)=>{
    if(error)return resolve(unavailable);
    const fields=String(stdout).trim().split(/\r?\n/)[0].split(',').map(value=>value.trim());
    if(fields.length!==4)return resolve(unavailable);
    const numbers=fields.map(value=>value!==''&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)?Number(value):NaN);
    const gpuUtilPercent=bounded(numbers[0],100),total=bounded(numbers[2],1048576),used=bounded(numbers[1],total??-1);
    resolve({gpuUtilPercent,vramUsedMiB:total>0?used:null,vramTotalMiB:total>0?total:null,gpuTempC:bounded(numbers[3],150)});
   });
  }catch{resolve(unavailable);}
 });
}

// Whole-PC/device observations. No inference imports, model loading or cloud I/O.
export class ResourceSampler {
 constructor({system=os,gpu=readGpu,now=Date.now}={}){this.system=system;this.gpu=gpu;this.now=now;this.previous=null;try{this.previous=cpuTimes(system.cpus());}catch{}}
 async sample({signal}={}){
  const value=emptyResources(this.now());
  try{
   const current=cpuTimes(this.system.cpus()),previous=this.previous;this.previous=current;
   if(previous){const total=current.total-previous.total,idle=current.idle-previous.idle;
    if(total>0&&idle>=0&&idle<=total)value.cpuPercent=Math.round(1000*(1-idle/total))/10;
   }
  }catch{}
  try{
   const total=this.system.totalmem(),free=this.system.freemem();
   if(Number.isSafeInteger(total)&&total>0&&Number.isSafeInteger(free)&&free>=0&&free<=total){value.ramTotalBytes=total;value.ramUsedBytes=total-free;}
  }catch{}
  try{Object.assign(value,await this.gpu({signal}));}catch{}
  return value;
 }
}
